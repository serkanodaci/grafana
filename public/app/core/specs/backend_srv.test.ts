import { BackendSrv, getBackendSrv } from '../services/backend_srv';
import { Emitter } from '../utils/emitter';
import { ContextSrv, User } from '../services/context_srv';
import { Observable, of } from 'rxjs';
import { AppEvents } from '@grafana/data';
import { CoreEvents } from '../../types';
import { delay } from 'rxjs/operators';

const getTestContext = (overides?: object) => {
  const defaults = {
    data: { test: 'hello world' },
    ok: true,
    status: 200,
    statusText: 'Ok',
    isSignedIn: true,
    orgId: 1337,
  };
  const props = { ...defaults, ...overides };
  const textMock = jest.fn().mockResolvedValue(JSON.stringify(props.data));
  const fromFetchMock = jest.fn().mockImplementation(() => {
    return of({
      ok: props.ok,
      status: props.status,
      statusText: props.statusText,
      text: textMock,
    });
  });
  const appEventsMock: Emitter = ({
    emit: jest.fn(),
  } as any) as Emitter;
  const user: User = ({
    isSignedIn: props.isSignedIn,
    orgId: props.orgId,
  } as any) as User;
  const contextSrvMock: ContextSrv = ({
    user,
  } as any) as ContextSrv;
  const logoutMock = jest.fn();
  const parseRequestOptionsMock = jest.fn().mockImplementation(options => options);
  const parseDataSourceRequestOptionsMock = jest.fn().mockImplementation(options => options);
  const parseUrlFromOptionsMock = jest.fn().mockImplementation(() => 'parseUrlFromOptionsMock');
  const parseInitFromOptionsMock = jest.fn().mockImplementation(() => 'parseInitFromOptionsMock');

  const backendSrv = new BackendSrv({
    fromFetch: fromFetchMock,
    appEvents: appEventsMock,
    contextSrv: contextSrvMock,
    logout: logoutMock,
  });

  backendSrv['parseRequestOptions'] = parseRequestOptionsMock;
  backendSrv['parseDataSourceRequestOptions'] = parseDataSourceRequestOptionsMock;
  backendSrv['parseUrlFromOptions'] = parseUrlFromOptionsMock;
  backendSrv['parseInitFromOptions'] = parseInitFromOptionsMock;

  const expectCallChain = (options: any) => {
    expect(parseUrlFromOptionsMock).toHaveBeenCalledTimes(1);
    expect(parseUrlFromOptionsMock).toHaveBeenCalledWith(options);
    expect(parseInitFromOptionsMock).toHaveBeenCalledTimes(1);
    expect(parseInitFromOptionsMock).toHaveBeenCalledWith(options);
    expect(fromFetchMock).toHaveBeenCalledTimes(1);
    expect(fromFetchMock).toHaveBeenCalledWith('parseUrlFromOptionsMock', 'parseInitFromOptionsMock');
  };

  const expectRequestCallChain = (options: any) => {
    expect(parseRequestOptionsMock).toHaveBeenCalledTimes(1);
    expect(parseRequestOptionsMock).toHaveBeenCalledWith(options, 1337);
    expectCallChain(options);
  };

  const expectDataSourceRequestCallChain = (options: any) => {
    expect(parseDataSourceRequestOptionsMock).toHaveBeenCalledTimes(1);
    expect(parseDataSourceRequestOptionsMock).toHaveBeenCalledWith(options, 1337, undefined);
    expectCallChain(options);
  };

  return {
    backendSrv,
    fromFetchMock,
    appEventsMock,
    contextSrvMock,
    textMock,
    logoutMock,
    parseRequestOptionsMock,
    parseDataSourceRequestOptionsMock,
    parseUrlFromOptionsMock,
    parseInitFromOptionsMock,
    expectRequestCallChain,
    expectDataSourceRequestCallChain,
  };
};

describe('backendSrv', () => {
  describe('parseRequestOptions', () => {
    it.each`
      retry        | url                                      | orgId        | expected
      ${undefined} | ${'http://localhost:3000/api/dashboard'} | ${undefined} | ${{ retry: 0, url: 'http://localhost:3000/api/dashboard' }}
      ${1}         | ${'http://localhost:3000/api/dashboard'} | ${1}         | ${{ retry: 1, url: 'http://localhost:3000/api/dashboard' }}
      ${undefined} | ${'api/dashboard'}                       | ${undefined} | ${{ retry: 0, url: 'api/dashboard' }}
      ${undefined} | ${'/api/dashboard'}                      | ${undefined} | ${{ retry: 0, url: 'api/dashboard' }}
      ${undefined} | ${'/api/dashboard/'}                     | ${undefined} | ${{ retry: 0, url: 'api/dashboard' }}
      ${1}         | ${'/api/dashboard/'}                     | ${undefined} | ${{ retry: 1, url: 'api/dashboard' }}
      ${undefined} | ${'/api/dashboard/'}                     | ${1}         | ${{ retry: 0, url: 'api/dashboard', headers: { 'X-Grafana-Org-Id': 1 } }}
      ${1}         | ${'/api/dashboard/'}                     | ${1}         | ${{ retry: 1, url: 'api/dashboard', headers: { 'X-Grafana-Org-Id': 1 } }}
    `(
      "when called with retry: '$retry', url: '$url' and orgId: '$orgId' then result should be '$expected'",
      ({ retry, url, orgId, expected }) => {
        expect(getBackendSrv()['parseRequestOptions']({ retry, url }, orgId)).toEqual(expected);
      }
    );
  });

  describe('parseDataSourceRequestOptions', () => {
    it.each`
      retry        | url                                      | headers                           | orgId        | noBackendCache | expected
      ${undefined} | ${'http://localhost:3000/api/dashboard'} | ${undefined}                      | ${undefined} | ${undefined}   | ${{ retry: 0, url: 'http://localhost:3000/api/dashboard' }}
      ${1}         | ${'http://localhost:3000/api/dashboard'} | ${{ Authorization: 'Some Auth' }} | ${1}         | ${true}        | ${{ retry: 1, url: 'http://localhost:3000/api/dashboard', headers: { Authorization: 'Some Auth' } }}
      ${undefined} | ${'api/dashboard'}                       | ${undefined}                      | ${undefined} | ${undefined}   | ${{ retry: 0, url: 'api/dashboard' }}
      ${undefined} | ${'/api/dashboard'}                      | ${undefined}                      | ${undefined} | ${undefined}   | ${{ retry: 0, url: 'api/dashboard' }}
      ${undefined} | ${'/api/dashboard/'}                     | ${undefined}                      | ${undefined} | ${undefined}   | ${{ retry: 0, url: 'api/dashboard/' }}
      ${undefined} | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${undefined} | ${undefined}   | ${{ retry: 0, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth' } }}
      ${undefined} | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${1}         | ${undefined}   | ${{ retry: 0, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth', 'X-Grafana-Org-Id': 1 } }}
      ${undefined} | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${1}         | ${true}        | ${{ retry: 0, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth', 'X-Grafana-Org-Id': 1, 'X-Grafana-NoCache': 'true' } }}
      ${1}         | ${'/api/dashboard/'}                     | ${undefined}                      | ${undefined} | ${undefined}   | ${{ retry: 1, url: 'api/dashboard/' }}
      ${1}         | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${undefined} | ${undefined}   | ${{ retry: 1, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth' } }}
      ${1}         | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${1}         | ${undefined}   | ${{ retry: 1, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth', 'X-Grafana-Org-Id': 1 } }}
      ${1}         | ${'/api/dashboard/'}                     | ${{ Authorization: 'Some Auth' }} | ${1}         | ${true}        | ${{ retry: 1, url: 'api/dashboard/', headers: { 'X-DS-Authorization': 'Some Auth', 'X-Grafana-Org-Id': 1, 'X-Grafana-NoCache': 'true' } }}
    `(
      "when called with retry: '$retry', url: '$url', headers: '$headers', orgId: '$orgId' and noBackendCache: '$noBackendCache' then result should be '$expected'",
      ({ retry, url, headers, orgId, noBackendCache, expected }) => {
        expect(
          getBackendSrv()['parseDataSourceRequestOptions']({ retry, url, headers }, orgId, noBackendCache)
        ).toEqual(expected);
      }
    );
  });

  describe('parseUrlFromOptions', () => {
    it.each`
      params                                                      | url                | expected
      ${undefined}                                                | ${'api/dashboard'} | ${'api/dashboard'}
      ${{ key: 'value' }}                                         | ${'api/dashboard'} | ${'api/dashboard?key=value'}
      ${{ key: undefined }}                                       | ${'api/dashboard'} | ${'api/dashboard'}
      ${{ firstKey: 'first value', secondValue: 'second value' }} | ${'api/dashboard'} | ${'api/dashboard?firstKey=first%20value&secondValue=second%20value'}
      ${{ firstKey: 'first value', secondValue: undefined }}      | ${'api/dashboard'} | ${'api/dashboard?firstKey=first%20value'}
      ${{ id: [1, 2, 3] }}                                        | ${'api/dashboard'} | ${'api/dashboard?id=1&id=2&id=3'}
      ${{ id: [] }}                                               | ${'api/dashboard'} | ${'api/dashboard'}
    `(
      "when called with params: '$params' and url: '$url' then result should be '$expected'",
      ({ params, url, expected }) => {
        expect(getBackendSrv()['parseUrlFromOptions']({ params, url })).toEqual(expected);
      }
    );
  });

  describe('parseInitFromOptions', () => {
    it.each`
      method       | headers                  | data                               | expected
      ${undefined} | ${undefined}             | ${undefined}                       | ${{ method: undefined, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' }, body: undefined }}
      ${'GET'}     | ${undefined}             | ${undefined}                       | ${{ method: 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' }, body: undefined }}
      ${'GET'}     | ${{ Auth: 'Some Auth' }} | ${undefined}                       | ${{ method: 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Auth: 'Some Auth' }, body: undefined }}
      ${'GET'}     | ${{ Auth: 'Some Auth' }} | ${{ data: { test: 'Some data' } }} | ${{ method: 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Auth: 'Some Auth' }, body: '{"data":{"test":"Some data"}}' }}
      ${'GET'}     | ${{ Auth: 'Some Auth' }} | ${'some data'}                     | ${{ method: 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Auth: 'Some Auth' }, body: '"some data"' }}
    `(
      "when called with method: '$method', headers: '$headers' and data: '$data' then result should be '$expected'",
      ({ method, headers, data, expected }) => {
        expect(getBackendSrv()['parseInitFromOptions']({ method, headers, data, url: '' })).toEqual(expected);
      }
    );
  });

  describe('request', () => {
    describe('when making a successful call and conditions for showSuccessAlert are not favorable', () => {
      it('then it should return correct result and not emit anything', async () => {
        const { backendSrv, appEventsMock, expectRequestCallChain } = getTestContext({
          data: { message: 'A message' },
        });
        const url = '/api/dashboard/';
        const result = await backendSrv.request({ url, method: 'DELETE', showSuccessAlert: false });
        expect(result).toEqual({ message: 'A message' });
        expect(appEventsMock.emit).not.toHaveBeenCalled();
        expectRequestCallChain({ url, method: 'DELETE', showSuccessAlert: false });
      });
    });

    describe('when making a successful call and conditions for showSuccessAlert are favorable', () => {
      it('then it should emit correct message', async () => {
        const { backendSrv, appEventsMock, expectRequestCallChain } = getTestContext({
          data: { message: 'A message' },
        });
        const url = '/api/dashboard/';
        const result = await backendSrv.request({ url, method: 'DELETE', showSuccessAlert: true });
        expect(result).toEqual({ message: 'A message' });
        expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
        expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvents.alertSuccess, ['A message']);
        expectRequestCallChain({ url, method: 'DELETE', showSuccessAlert: true });
      });
    });

    describe('when making an unsuccessful call and conditions for retry are favorable and loginPing does not throw', () => {
      it('then it should retry', async () => {
        jest.useFakeTimers();
        const { backendSrv, appEventsMock, logoutMock, expectRequestCallChain } = getTestContext({
          ok: false,
          status: 401,
          statusText: 'UnAuthorized',
          data: { message: 'UnAuthorized' },
        });
        backendSrv.loginPing = jest
          .fn()
          .mockResolvedValue({ ok: true, status: 200, statusText: 'OK', data: { message: 'Ok' } });
        const url = '/api/dashboard/';
        // it would be better if we could simulate that after the call to loginPing everything is successful but as
        // our fromFetchMock returns ok:false the second time this retries it will still be ok:false going into the
        // mergeMap in toFailureStream
        await backendSrv.request({ url, method: 'GET', retry: 0 }).catch(error => {
          expect(error.status).toBe(401);
          expect(error.statusText).toBe('UnAuthorized');
          expect(error.data).toEqual({ message: 'UnAuthorized' });
          expect(appEventsMock.emit).not.toHaveBeenCalled();
          expect(backendSrv.loginPing).toHaveBeenCalledTimes(1);
          expect(logoutMock).toHaveBeenCalledTimes(1);
          expectRequestCallChain({ url, method: 'GET', retry: 0 });
          jest.advanceTimersByTime(50);
          expect(appEventsMock.emit).not.toHaveBeenCalled();
        });
      });
    });

    describe('when making an unsuccessful call and conditions for retry are favorable and retry throws', () => {
      it('then it throw error', async () => {
        jest.useFakeTimers();
        const { backendSrv, appEventsMock, logoutMock, expectRequestCallChain } = getTestContext({
          ok: false,
          status: 401,
          statusText: 'UnAuthorized',
          data: { message: 'UnAuthorized' },
        });
        backendSrv.loginPing = jest
          .fn()
          .mockRejectedValue({ status: 403, statusText: 'Forbidden', data: { message: 'Forbidden' } });
        const url = '/api/dashboard/';
        await backendSrv
          .request({ url, method: 'GET', retry: 0 })
          .catch(error => {
            expect(error.status).toBe(403);
            expect(error.statusText).toBe('Forbidden');
            expect(error.data).toEqual({ message: 'Forbidden' });
            expect(appEventsMock.emit).not.toHaveBeenCalled();
            expect(backendSrv.loginPing).toHaveBeenCalledTimes(1);
            expect(logoutMock).not.toHaveBeenCalled();
            expectRequestCallChain({ url, method: 'GET', retry: 0 });
            jest.advanceTimersByTime(50);
          })
          .catch(error => {
            expect(error).toEqual({ message: 'Forbidden' });
            expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
            expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvents.alertWarning, ['Forbidden', '']);
          });
      });
    });

    describe('when making an unsuccessful 422 call', () => {
      it('then it should emit Validation failed message', async () => {
        jest.useFakeTimers();
        const { backendSrv, appEventsMock, logoutMock, expectRequestCallChain } = getTestContext({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          data: { message: 'Unprocessable Entity' },
        });
        const url = '/api/dashboard/';
        await backendSrv
          .request({ url, method: 'GET' })
          .catch(error => {
            expect(error.status).toBe(422);
            expect(error.statusText).toBe('Unprocessable Entity');
            expect(error.data).toEqual({ message: 'Unprocessable Entity' });
            expect(appEventsMock.emit).not.toHaveBeenCalled();
            expect(logoutMock).not.toHaveBeenCalled();
            expectRequestCallChain({ url, method: 'GET' });
            jest.advanceTimersByTime(50);
          })
          .catch(error => {
            expect(error).toEqual({ message: 'Unprocessable Entity' });
            expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
            expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvents.alertWarning, [
              'Validation failed',
              'Unprocessable Entity',
            ]);
          });
      });
    });

    describe('when making an unsuccessful call and we handle the error', () => {
      it('then it should not emit message', async () => {
        jest.useFakeTimers();
        const { backendSrv, appEventsMock, logoutMock, expectRequestCallChain } = getTestContext({
          ok: false,
          status: 404,
          statusText: 'Not found',
          data: { message: 'Not found' },
        });
        const url = '/api/dashboard/';
        await backendSrv.request({ url, method: 'GET' }).catch(error => {
          expect(error.status).toBe(404);
          expect(error.statusText).toBe('Not found');
          expect(error.data).toEqual({ message: 'Not found' });
          expect(appEventsMock.emit).not.toHaveBeenCalled();
          expect(logoutMock).not.toHaveBeenCalled();
          expectRequestCallChain({ url, method: 'GET' });
          error.isHandled = true;
          jest.advanceTimersByTime(50);
          expect(appEventsMock.emit).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('datasourceRequest', () => {
    describe('when making a successful call and silent is true', () => {
      it('then it should not emit message', async () => {
        const { backendSrv, appEventsMock, expectDataSourceRequestCallChain } = getTestContext();
        const url = 'http://www.some.url.com/';
        const result = await backendSrv.datasourceRequest({ url, silent: true });
        expect(result).toEqual({ data: { test: 'hello world' } });
        expect(appEventsMock.emit).not.toHaveBeenCalled();
        expectDataSourceRequestCallChain({ url, silent: true });
      });
    });

    describe('when making a successful call and silent is not defined', () => {
      it('then it should not emit message', async () => {
        const { backendSrv, appEventsMock, expectDataSourceRequestCallChain } = getTestContext();
        const url = 'http://www.some.url.com/';
        const result = await backendSrv.datasourceRequest({ url });
        expect(result).toEqual({ data: { test: 'hello world' } });
        expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
        expect(appEventsMock.emit).toHaveBeenCalledWith(CoreEvents.dsRequestResponse, {
          data: { test: 'hello world' },
        });
        expectDataSourceRequestCallChain({ url });
      });
    });

    describe('when called with the same requestId twice', () => {
      it('then it should cancel the first call and the first call should be unsubscribed', async () => {
        const { backendSrv, fromFetchMock } = getTestContext();
        const unsubscribe = jest.fn();
        const slowData = { message: 'Slow Request' };
        const slowFetch = new Observable(subscriber => {
          subscriber.next({
            ok: true,
            status: 200,
            statusText: 'Ok',
            text: () => Promise.resolve(JSON.stringify(slowData)),
          });
          return unsubscribe;
        }).pipe(delay(10000));
        const fastData = { message: 'Fast Request' };
        const fastFetch = of({
          ok: true,
          status: 200,
          statusText: 'Ok',
          text: () => Promise.resolve(JSON.stringify(fastData)),
        });
        fromFetchMock.mockImplementationOnce(() => slowFetch);
        fromFetchMock.mockImplementation(() => fastFetch);
        const options = {
          url: '/api/dashboard/',
          requestId: 'A',
        };
        const slowRequest = backendSrv.datasourceRequest(options);
        const fastResponse = await backendSrv.datasourceRequest(options);
        expect(fastResponse).toEqual({ data: { message: 'Fast Request' } });

        const slowResponse = await slowRequest;
        expect(slowResponse).toEqual(undefined);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });
    });

    describe('when making an unsuccessful call and conditions for retry are favorable and loginPing does not throw', () => {
      it('then it should retry', async () => {
        const { backendSrv, appEventsMock, logoutMock, expectDataSourceRequestCallChain } = getTestContext({
          ok: false,
          status: 401,
          statusText: 'UnAuthorized',
          data: { message: 'UnAuthorized' },
        });
        backendSrv.loginPing = jest
          .fn()
          .mockResolvedValue({ ok: true, status: 200, statusText: 'OK', data: { message: 'Ok' } });
        const url = '/api/dashboard/';
        // it would be better if we could simulate that after the call to loginPing everything is successful but as
        // our fromFetchMock returns ok:false the second time this retries it will still be ok:false going into the
        // mergeMap in toFailureStream
        await backendSrv.datasourceRequest({ url, method: 'GET', retry: 0 }).catch(error => {
          expect(error.status).toBe(401);
          expect(error.statusText).toBe('UnAuthorized');
          expect(error.data).toEqual({ message: 'UnAuthorized' });
          expect(appEventsMock.emit).not.toHaveBeenCalled();
          expect(backendSrv.loginPing).toHaveBeenCalledTimes(1);
          expect(logoutMock).toHaveBeenCalledTimes(1);
          expectDataSourceRequestCallChain({ url, method: 'GET', retry: 0 });
        });
      });
    });

    describe('when making an unsuccessful call and conditions for retry are favorable and retry throws', () => {
      it('then it throw error', async () => {
        const { backendSrv, appEventsMock, logoutMock, expectDataSourceRequestCallChain } = getTestContext({
          ok: false,
          status: 401,
          statusText: 'UnAuthorized',
          data: { message: 'UnAuthorized' },
        });
        backendSrv.loginPing = jest
          .fn()
          .mockRejectedValue({ status: 403, statusText: 'Forbidden', data: { message: 'Forbidden' } });
        const url = '/api/dashboard/';
        await backendSrv.datasourceRequest({ url, method: 'GET', retry: 0 }).catch(error => {
          expect(error.status).toBe(403);
          expect(error.statusText).toBe('Forbidden');
          expect(error.data).toEqual({ message: 'Forbidden' });
          expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
          expect(appEventsMock.emit).toHaveBeenCalledWith(CoreEvents.dsRequestError, {
            data: { message: 'Forbidden' },
            status: 403,
            statusText: 'Forbidden',
          });
          expect(backendSrv.loginPing).toHaveBeenCalledTimes(1);
          expect(logoutMock).not.toHaveBeenCalled();
          expectDataSourceRequestCallChain({ url, method: 'GET', retry: 0 });
        });
      });
    });

    describe('when making a HTTP_REQUEST_CANCELED call', () => {
      it('then it should throw cancelled error', async () => {
        const { backendSrv, appEventsMock, logoutMock, expectDataSourceRequestCallChain } = getTestContext({
          ok: false,
          status: -1,
          statusText: 'HTTP_REQUEST_CANCELED',
          data: { message: 'HTTP_REQUEST_CANCELED' },
        });
        const url = '/api/dashboard/';
        await backendSrv.datasourceRequest({ url, method: 'GET' }).catch(error => {
          expect(error).toEqual({
            err: {
              status: -1,
              statusText: 'HTTP_REQUEST_CANCELED',
              data: { message: 'HTTP_REQUEST_CANCELED' },
            },
            cancelled: true,
          });
          expect(appEventsMock.emit).not.toHaveBeenCalled();
          expect(logoutMock).not.toHaveBeenCalled();
          expectDataSourceRequestCallChain({ url, method: 'GET' });
        });
      });
    });

    describe('when making an Internal Error call', () => {
      it('then it should throw cancelled error', async () => {
        const { backendSrv, appEventsMock, logoutMock, expectDataSourceRequestCallChain } = getTestContext({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          data: 'Internal Server Error',
        });
        const url = '/api/dashboard/';
        await backendSrv.datasourceRequest({ url, method: 'GET' }).catch(error => {
          expect(error).toEqual({
            status: 500,
            statusText: 'Internal Server Error',
            data: {
              error: 'Internal Server Error',
              response: 'Internal Server Error',
              message: 'Internal Server Error',
            },
          });
          expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
          expect(appEventsMock.emit).toHaveBeenCalledWith(CoreEvents.dsRequestError, {
            status: 500,
            statusText: 'Internal Server Error',
            data: {
              error: 'Internal Server Error',
              response: 'Internal Server Error',
              message: 'Internal Server Error',
            },
          });
          expect(logoutMock).not.toHaveBeenCalled();
          expectDataSourceRequestCallChain({ url, method: 'GET' });
        });
      });
    });

    describe('when formatting prometheus error', () => {
      it('then it should throw cancelled error', async () => {
        const { backendSrv, appEventsMock, logoutMock, expectDataSourceRequestCallChain } = getTestContext({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          data: { error: 'Forbidden' },
        });
        const url = '/api/dashboard/';
        await backendSrv.datasourceRequest({ url, method: 'GET' }).catch(error => {
          expect(error).toEqual({
            status: 403,
            statusText: 'Forbidden',
            data: {
              error: 'Forbidden',
              message: 'Forbidden',
            },
          });
          expect(appEventsMock.emit).toHaveBeenCalledTimes(1);
          expect(appEventsMock.emit).toHaveBeenCalledWith(CoreEvents.dsRequestError, {
            status: 403,
            statusText: 'Forbidden',
            data: {
              error: 'Forbidden',
              message: 'Forbidden',
            },
          });
          expect(logoutMock).not.toHaveBeenCalled();
          expectDataSourceRequestCallChain({ url, method: 'GET' });
        });
      });
    });
  });
});
